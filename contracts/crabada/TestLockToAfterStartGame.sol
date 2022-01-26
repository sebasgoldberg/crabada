// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IIddleGame.sol";

interface IMiner{
    function startGame(uint256 teamId) external;
}

interface IAttacker{
    function attack(uint256 gameId, uint256 attackTeamId) external;
}

contract TestLockToAfterStartGame{

    function test(IIddleGame idleGame, IMiner miner, uint256 teamId) public{
        
        miner.startGame(teamId);

        uint256 lockTo;

        (
                /*address owner*/, /*uint256 crabadaId1*/, /*uint256 crabadaId2*/, 
                /*uint256 crabadaId3*/, /*uint16 battlePoint*/, /*uint16 timePoint*/, 
                /*currentGameId*/, lockTo
            ) = idleGame.getTeamInfo(teamId);

        require(lockTo-block.timestamp==14400);

    }

}