// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IIddleGame.sol";

import "../access/MultiOwnable.sol";

import "hardhat/console.sol";

interface IMiner{
    function startGame(uint256 teamId) external;
}

interface IAttacker{
    function attack(uint256 gameId, uint256 attackTeamId) external;
}

contract AttackRouter is MultiOwnable{

    struct LocalData{
        uint256[] targetsGameIds;
        bool[] targetIsNotAvailable;
        bool existsTargetThatItIsMining;
        bool existsTargetThatItIsAvailable;
        bool attackPerformed;
    }

    /**
    * @param lootersTeamIds Ordered by battle points.
    * @param targetTeamIds Ordered by battle points.
    */
    function attackTeams(
        IIddleGame idleGame,
        IAttacker[] calldata looters, uint256[] calldata lootersTeamIds, uint16[] calldata looterBattlePoints, 
        uint256[] calldata targetTeamIds, uint16[] calldata targetBattlePoints
        )
        public
        onlyOwner(){

        LocalData memory localData;

        localData.targetsGameIds = new uint256[](targetTeamIds.length);
        localData.targetIsNotAvailable = new bool[](targetTeamIds.length);

        localData.existsTargetThatItIsMining = false;
        localData.existsTargetThatItIsAvailable = false;

        for(uint256 targetIndex=0; targetIndex < targetTeamIds.length; targetIndex++){

            uint128 lockTo;

            (
                /*address owner*/, /*uint256 crabadaId1*/, /*uint256 crabadaId2*/, 
                /*uint256 crabadaId3*/, /*uint16 battlePoint*/, /*uint16 timePoint*/, 
                localData.targetsGameIds[targetIndex], lockTo
            ) = idleGame.getTeamInfo(targetTeamIds[targetIndex]);

            // To avoid GAME OUT OF TIME
            if (lockTo == block.timestamp + 14400)
                continue;

            // Verifies that the target it is mining.
            if (localData.targetsGameIds[targetIndex] != 0 && lockTo>block.timestamp){

                localData.existsTargetThatItIsMining = true;
                
                (
                    uint256 attackTeamId, /*uint32 attackTime*/, /*uint32 lastAttackTime*/, 
                    /*uint32 lastDefTime*/, /*uint256 attackId1*/, /*uint256 attackId2*/,
                    /*uint256 defId1*/, /*uint256 defId2*/
                ) = idleGame.getGameBattleInfo(localData.targetsGameIds[targetIndex]);

                // It is obtained if team is already looted.
                localData.targetIsNotAvailable[targetIndex] = (attackTeamId != 0);

                if (!localData.targetIsNotAvailable[targetIndex]){
                    localData.existsTargetThatItIsAvailable = true;
                }

            }

        }

        if (!localData.existsTargetThatItIsMining){
            revert('ROUTER: NO TARGET MINING');
        }

        if (!localData.existsTargetThatItIsAvailable){
            revert('ROUTER: NO TARGET AVAILABLE');
        }

        localData.attackPerformed = false;

        for(uint16 looterIndex=0; looterIndex<lootersTeamIds.length; looterIndex++){

            uint256 looterTeamId = lootersTeamIds[looterIndex];

            (
                /*address owner*/, /*uint256 crabadaId1*/, /*uint256 crabadaId2*/, 
                /*uint256 crabadaId3*/, /*uint16 battlePoint*/, /*uint16 timePoint*/, 
                uint256 currentGameId, /*uint128 lockTo*/
            ) = idleGame.getTeamInfo(looterTeamId);

            // It is verified if the looter it is already bussy.
            if (currentGameId != 0)
                continue;

            for(uint256 targetIndex=0; targetIndex<targetTeamIds.length; targetIndex++){

                if (localData.targetIsNotAvailable[targetIndex])
                    continue;

                // In case the looter's battle point are lower than the target, this means
                // that the next targets, also have higher battle points (because ).
                if (looterBattlePoints[looterIndex] <= targetBattlePoints[targetIndex])
                    break;
                
                // Should not revert!!!
                looters[looterIndex].attack(localData.targetsGameIds[targetIndex], looterTeamId);

                // After looting we mark it as not available.
                localData.targetIsNotAvailable[targetIndex] = true;
                localData.attackPerformed = true;

                break;

            }

        }

        if (!localData.attackPerformed){
            revert('ROUTER: NO ATTACK PERFORMED');
        }

    }

}