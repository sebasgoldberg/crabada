// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IIddleGame.sol";
import "./ICrabada.sol";

interface IMiner{
    function startGame(uint256 teamId) external;
}

interface IAttacker{
    function attack(uint256 gameId, uint256 attackTeamId) external;
}

contract Router is Ownable{

    IIddleGame public iddleGame;
    ICrabada public crabada;

    constructor(IIddleGame _iddleGame, ICrabada _crabada){
        iddleGame = _iddleGame;
        crabada = _crabada;
    }

    function startGameAndAttack(IMiner miner, uint256 minerTeamId, IAttacker attacker, uint256 attackerTeamId)
        public
        onlyOwner(){

        miner.startGame(minerTeamId);

        (
            /*address owner*/, /*uint256 crabadaId1*/, /*uint256 crabadaId2*/, 
            /*uint256 crabadaId3*/, /*uint16 battlePoint*/, /*uint16 timePoint*/, 
            uint256 currentGameId, /*uint128 lockTo*/
            ) = iddleGame.getTeamInfo(minerTeamId);

        attacker.attack(currentGameId, attackerTeamId);

    }

}