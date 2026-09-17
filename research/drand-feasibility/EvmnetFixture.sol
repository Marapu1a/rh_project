// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {BLS} from "./vendor/BLS.sol";

/// @notice Research only. No lottery, funds, owner or production authorization.
contract EvmnetFixture {
    bytes public constant DST = "BLS_SIG_BN254G1_XMD:KECCAK-256_SVDW_RO_NUL_";
    uint256 public constant GENESIS = 1727521075;
    uint256 public constant PERIOD = 3;
    mapping(uint64 => bool) public proven;
    mapping(uint64 => bytes32) public randomness;
    event RoundProven(uint64 indexed round, bytes32 value);

    function publicKey() public pure returns (uint256[4] memory) {
        // drand serialization is imaginary/real; BLS.verifySingle expects real/imaginary.
        return [
            uint256(0x0557ec32c2ad488e4d4f6008f89a346f18492092ccc0d594610de2732c8b808f),
            uint256(0x07e1d1d335df83fa98462005690372c643340060d205306a9aa8106b6bd0b382),
            uint256(0x297d3a4f9749b33eb2d904c9d9ebf17224150ddd7abd7567a9bec6c74480ee0b),
            uint256(0x0095685ae3a85ba243747b1b2f426049010f6b73a0cf1d389351d5aaaa1047f6)
        ];
    }
    function messagePoint(uint64 round, bytes memory dst) public view returns (uint256[2] memory) {
        require(round != 0, "round zero");
        return BLS.hashToPoint(dst, abi.encodePacked(keccak256(abi.encodePacked(round))));
    }
    // Configurable verification exists only for negative tests, never changes registry key/DST.
    function check(uint64 round, bytes calldata signature, uint256[4] memory key, bytes memory dst)
        public view returns (bool)
    {
        require(signature.length == 64, "signature length");
        uint256[2] memory sig = abi.decode(signature, (uint256[2]));
        if (!BLS.isValidSignature(sig)) return false;
        (bool pairing, bool success) = BLS.verifySingle(sig, key, messagePoint(round, dst));
        return success && pairing;
    }
    function verify(uint64 round, bytes calldata signature) public view returns (bool) {
        return check(round, signature, publicKey(), DST);
    }
    function prove(uint64 round, bytes calldata signature) external returns (bytes32 value) {
        require(round > 0 && GENESIS + (uint256(round) - 1) * PERIOD <= block.timestamp, "not due");
        require(verify(round, signature), "invalid proof");
        value = sha256(signature);
        if (proven[round]) { require(randomness[round] == value, "different value"); return value; }
        proven[round] = true;
        randomness[round] = value;
        emit RoundProven(round, value);
    }
}
