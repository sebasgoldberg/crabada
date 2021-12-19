// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IIddleGame.sol";
import "./ICrabada.sol";

interface IAttacker{
    function attack(uint256 gameId, uint256 attackTeamId) external;
}

contract ProxyAttack{

    IIddleGame public iddleGame;
    ICrabada public crabada;

    constructor(IIddleGame _iddleGame, ICrabada _crabada){
        iddleGame = _iddleGame;
        crabada = _crabada;
    }

    function delegatedAttack(uint256 gameId, uint256 attackTeamId) public{

        (bool success, ) = address(iddleGame).delegatecall(
            abi.encodeWithSignature("attack(uint256,uint256)", gameId, attackTeamId)
        );

        if (!success)
            revert('ProxyAttack: DELEGATED ATTACK FAILED.');

    }

    /**
    * msg.sender should be the owner of attackerTeamId.
    */
    function attack(uint256 minerTeamId, uint256 attackerTeamId) public{

        (
            /*address owner*/, /*uint256 crabadaId1*/, /*uint256 crabadaId2*/, 
            /*uint256 crabadaId3*/, /*uint16 battlePoint*/, /*uint16 timePoint*/, 
            uint256 currentGameId, /*uint128 lockTo*/
            ) = iddleGame.getTeamInfo(minerTeamId);

        delegatedAttack(currentGameId, attackerTeamId);

    }

}