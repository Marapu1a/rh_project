// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
interface IQuote { function balanceOf(address) external view returns(uint256); }
interface ICreator {
    function currentPolicy() external view returns(uint64,address,uint16);
    function claim(address[] calldata) external returns(uint256);
}
// Fork-only proof fixture, NOT a production collector. Holds all receipts, no withdrawal.
contract LocalInfinityReceiver {
    address public immutable owner = msg.sender;
    address public immutable quote;
    address public vault;
    constructor(address q) { require(block.chainid == 31337); quote=q; }
    function bind(address v) external {
        require(msg.sender==owner && vault==address(0));
        (,address recipient,uint16 fee)=ICreator(v).currentPolicy();
        require(recipient==address(this) && fee==300); vault=v;
    }
    function pull() external returns(uint256 amount) {
        require(vault!=address(0));
        uint256 beforeBalance=IQuote(quote).balanceOf(address(this));
        address[] memory assets=new address[](1); assets[0]=quote;
        amount=ICreator(vault).claim(assets);
        require(IQuote(quote).balanceOf(address(this))-beforeBalance==amount);
    }
    function sqrtAt(int24 tick) external pure returns(uint160) { return TickMath.getSqrtPriceAtTick(tick); }
}
