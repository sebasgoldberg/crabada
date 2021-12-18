// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import "./IIddleGame.sol";
import "./ICrabada.sol";
import "hardhat/console.sol";

contract Player is Ownable, IERC721Receiver{

    IIddleGame public iddleGame;
    ICrabada public crabada;
    uint256[] public teams;
    bytes4 constant ERC721_RECEIVED = 0xf0b9e5ba;

    constructor(IIddleGame _iddleGame, ICrabada _crabada){
        iddleGame = _iddleGame;
        crabada = _crabada;
        crabada.setApprovalForAll(address(iddleGame), true);
    }

    /**
     * Always returns `IERC721Receiver.onERC721Received.selector`.
     */
    function onERC721Received(address, address, uint256, bytes memory) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function teamsCount() public view returns(uint256 count) {
        return teams.length;
    }

    function deposit(address from, uint256[] calldata crabadaIds) public{
        for (uint256 i = 0; i<crabadaIds.length; i++){
            //console.log('A: ownerOf(crabadaIds[i])', crabadaIds[i], crabada.ownerOf(crabadaIds[i]));
            crabada.safeTransferFrom(from, address(this), crabadaIds[i]);
            //console.log('B: ownerOf(crabadaIds[i])', crabadaIds[i], crabada.ownerOf(crabadaIds[i]), crabada.ownerOf(crabadaIds[i]) == address(this));
        }

        crabada.setApprovalForAll(from, true);

        iddleGame.deposit(crabadaIds);
    }
    
    function createTeam(uint256 crabadaId1, uint256 crabadaId2, uint256 crabadaId3) public
        onlyOwner()
        returns(uint256 teamId){

        require(teamsCount()<3, "PLAYER: MAX TEAMS ACHIVED");

        teamId = iddleGame.createTeam(crabadaId1, crabadaId2, crabadaId3);

        teams.push(teamId);

        return teamId;
    }

    function startGame(uint256 teamId) public
        onlyOwner(){

        iddleGame.startGame(teamId);

    }

    function attack(uint256 gameId, uint256 attackTeamId) public
        onlyOwner(){

        iddleGame.attack(gameId, attackTeamId);

    }

}