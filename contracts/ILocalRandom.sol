// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Local asynchronous transport, NOT the final drand adapter API.
/// request must return a unique nonzero key and must not deliver synchronously.
/// The controller permanently binds the returned key to one draw/context.
interface ILocalRandom {
    function ready() external view returns (bool);
    function fee() external view returns (uint256);
    function request(bytes32 context) external payable returns (uint256);
}
