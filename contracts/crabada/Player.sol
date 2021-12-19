// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "./IIddleGame.sol";
import "./ICrabada.sol";

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
            crabada.safeTransferFrom(from, address(this), crabadaIds[i]);
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

    function withdraw(address to, uint256[] calldata crabadaIds) public
        onlyOwner(){
        iddleGame.withdraw(to, crabadaIds);
    }
    
    function addCrabadaToTeam(uint256 teamId, uint256 position, uint256 crabadaId) public
        onlyOwner(){
        iddleGame.addCrabadaToTeam(teamId, position, crabadaId);
    }

    function removeCrabadaFromTeam(uint256 teamId, uint256 position) public
        onlyOwner(){
        iddleGame.removeCrabadaFromTeam(teamId, position);
    }

    function attackTeam(uint256 minerTeamId, uint256 attackerTeamId) public
        onlyOwner(){

        (
            /*address owner*/, /*uint256 crabadaId1*/, /*uint256 crabadaId2*/, 
            /*uint256 crabadaId3*/, /*uint16 battlePoint*/, /*uint16 timePoint*/, 
            uint256 currentGameId, /*uint128 lockTo*/
            ) = iddleGame.getTeamInfo(minerTeamId);

        iddleGame.attack(currentGameId, attackerTeamId);

    }

    function withdrawERC20(IERC20 ERC20, address to, uint256 amount) public
        onlyOwner(){
        ERC20.transfer(to, amount);
    }

    function withdrawERC721(IERC721 ERC721, address to, uint256 tokenId) public
        onlyOwner(){
        ERC721.safeTransferFrom(address(this), to, tokenId);
    }

    function withdrawNative(address payable to, uint256 amount) public
        onlyOwner(){
        to.transfer(amount);
    }

}