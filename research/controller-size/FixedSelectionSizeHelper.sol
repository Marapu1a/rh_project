// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ShortOutcome} from "../../contracts/ShortOutcome.sol";
/// Duplicated standalone study definition avoids an import cycle in memory variants.
contract ExternalSelectionSizeHelper {
    function select(bytes32 context,bytes32 seed,ShortOutcome.Participant[] calldata participants,ShortOutcome.Rules calldata rules,uint256 k)
        external pure returns(ShortOutcome.Candidate[] memory,uint256){return ShortOutcome.selectTopK(context,seed,participants,rules,k);}
}
