"""Read-only launch investigation. Never signs or broadcasts a transaction.
Run from workspace root; dependencies are isolated in research/_deps.
"""
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone
import requests

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '_deps'))
from eth_abi import encode, decode
from eth_hash.auto import keccak

URL = 'https://rpc.mainnet.chain.robinhood.com'
PROXY = '0x8660a7f019c7943b0b0a91b8e39aff3b6db6ae62'
FACTORY = os.environ.get('PAIR_FACTORY', '0xf197e48339ea495e458bf5c51984d6cc6f48c1d7')
USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168'
ZERO = '0x' + '00' * 20
TYPE = '(string,string,string,bytes32,(address,uint16)[],uint32,bytes,address[],uint16[],address,(uint256,uint256,(address,uint256,uint256)[]),uint256,bytes32)'
output = {'observedAtUtc': datetime.now(timezone.utc).isoformat(), 'reads': [], 'cases': []}

def save():
    (ROOT / os.environ.get('PAIR_SIMULATION_OUTPUT', 'native-launch-corrected.json')).write_text(json.dumps(output, indent=2), encoding='utf-8')

def rpc(method, params):
    assert method in {'eth_getBlockByNumber', 'eth_call', 'eth_getCode', 'eth_getStorageAt', 'eth_estimateGas'}
    response = requests.post(URL, json={'jsonrpc':'2.0', 'id':1, 'method':method, 'params':params}, timeout=35)
    response.raise_for_status()
    result = response.json()
    output['reads'].append({'method':method, 'params':params, 'response':result})
    save()
    return result

def call(to, signature, types=(), values=()):
    data = '0x' + (keccak(signature.encode())[:4] + encode(types, values)).hex()
    return rpc('eth_call', [{'to':to, 'data':data}, block])

old = json.loads((ROOT / 'current-usdg-launch-simulation.json').read_text())
tx = old['reads'][0]['response']['result']
p = list(decode([TYPE], bytes.fromhex(tx['input'][10:]))[0])
assert '0x' + (keccak(('launchV2Token('+TYPE+')').encode())[:4] + encode([TYPE], [p])).hex() == tx['input']
head = rpc('eth_getBlockByNumber', ['latest', False])['result']
block = head['number']
output['block'] = block
output['implementationSlot'] = rpc('eth_getStorageAt', [PROXY, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', block])
output['recipientCode'] = rpc('eth_getCode', ['0x766631e1a3ff2b460a34df221cff875a4bd967d0', block])
init = bytes.fromhex(call(FACTORY, 'tokenInitCodeHash()')['result'][2:])
creator = tx['from']
for n in range(202609110000, 202609110000 + 2000000):
    salt = n.to_bytes(32, 'big')
    address = keccak(b'\xff' + bytes.fromhex(FACTORY[2:]) + keccak(encode(['address','bytes32'], [creator,salt])) + init)[12:]
    if address[-2:] == b'\x55\x55' and int.from_bytes(address, 'big') > int(USDG,16):
        break
else:
    raise RuntimeError('Vanity search bound exhausted')
predicted = '0x' + address.hex()
verified = call(FACTORY, 'predictTokenAddress(address,bytes32)', ['address','bytes32'], [creator,salt])['result']
assert verified[-40:].lower() == address.hex()
assert rpc('eth_getCode', [predicted,block])['result'] == '0x'
output['vanity'] = {'factory':FACTORY, 'creator':creator, 'salt':'0x'+salt.hex(), 'predicted':predicted, 'attempts':n-202609110000+1}
print('Verified vanity',output['vanity'],flush=True)
p[11] = int(head['timestamp'],16)+1200
p[12] = salt
p[10] = (10**13, 1, [(USDG,10**13,1)])
fee = int(call(PROXY,'launchFeeWei()')['result'],16)
for label, recipient, buy in [('existing_contract_buy', '0x766631e1a3ff2b460a34df221cff875a4bd967d0', True), ('creator_buy',creator,True), ('existing_contract_no_buy','0x766631e1a3ff2b460a34df221cff875a4bd967d0',False)]:
    q=list(p)
    q[6]=encode(['address[]','uint16[]'],[[recipient],[10000]])
    q[7]=[]; q[8]=[]
    q[9]=creator if buy else ZERO
    q[10]=p[10] if buy else (0,0,[])
    data='0x'+(keccak(('launchV2Token('+TYPE+')').encode())[:4]+encode([TYPE],[q])).hex()
    response=rpc('eth_call',[{'from':creator,'to':PROXY,'data':data,'value':hex(fee+(10**13 if buy else 0)),'gas':hex(15000000)},block])
    output['cases'].append({'label':label,'recipient':recipient,'developerBuyWei':10**13 if buy else 0,'response':response})
    save(); print(label,response,flush=True)
    if label == 'existing_contract_buy':
        positive_call = {'from':creator,'to':PROXY,'data':data,'value':hex(fee+10**13),'gas':hex(15000000)}
        output['estimateGas'] = rpc('eth_estimateGas',[positive_call,block])
        invalid = list(q)
        invalid[12] = b'PAIR_READ_ONLY_RECON_20260911_V1'.ljust(32,b'\0')
        bad_call = dict(positive_call)
        bad_call['data'] = '0x'+(keccak(('launchV2Token('+TYPE+')').encode())[:4]+encode([TYPE],[invalid])).hex()
        bad_result = rpc('eth_call',[bad_call,block])
        output['invalidSaltControl'] = bad_result
        print('Invalid salt only control',bad_result,flush=True)
output['undeployedAfterCalls'] = rpc('eth_getCode',[predicted,'latest'])
save()
