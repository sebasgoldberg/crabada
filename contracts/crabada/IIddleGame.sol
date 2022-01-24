// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IIddleGame {

    function withdraw(address to, uint256[] calldata crabadaIds) external;
    function deposit(uint256[] calldata crabadaIds) external;
    function createTeam(uint256 crabadaId1, uint256 crabadaId2, uint256 crabadaId3) external returns(uint256 teamId);
    function addCrabadaToTeam(uint256 teamId, uint256 position, uint256 crabadaId) external;
    function removeCrabadaFromTeam(uint256 teamId, uint256 position) external;
    function attack(uint256 gameId, uint256 attackTeamId) external;

    function startGame(uint256 teamId) external;
    function reinforceAttack(uint256 gameId, uint256 crabadaId, uint256 borrowPrice) external;
    function reinforceDefense(uint256 gameId, uint256 crabadaId, uint256 borrowPrice) external;
    function closeGame(uint256 gameId) external;
    function settleGame(uint256 gameId) external;

    function getStats(uint256 crabadaId) external view returns(uint16 battlePoint, uint16 timePoint);
    function getTeamInfo(uint256 teamId) external view returns(address owner, uint256 crabadaId1, uint256 crabadaId2, uint256 crabadaId3, uint16 battlePoint, uint16 timePoint, uint256 currentGameId, uint128 lockTo);
    function getGameBasicInfo(uint256 gameId) external view returns(uint256 teamId, uint128 craReward, uint128 tusReward, uint32 startTime, uint32 duration, uint32 status);
    function getGameBattleInfo(uint256 gameId) external view returns(uint256 attackTeamId, uint32 attackTime, uint32 lastAttackTime, uint32 lastDefTime, uint256 attackId1, uint256 attackId2, uint256 defId1, uint256 defId2);
    function ownerOf(uint256 crabadaId) external view returns(address);

    function setLendingPrice(uint256 crabadaId, uint256 price) external;

}

