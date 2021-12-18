// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface ICrabada{

    function approve(address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata _data) external;
    function setApprovalForAll(address operator, bool approved) external;
    function breed(uint256 daddyId, uint256 mommyId) external;

    function getParentsInfo(uint256 tokenId) external view returns(uint256, uint256, uint256, uint256);
    function crabadaInfo(uint256) external view returns (uint256 daddyId, uint256 mommyId, uint256 dna, uint64 birthday, uint8 breedingCount);
    function ownerOf(uint256 tokenId) external view returns(address);
    function getApproved(uint256 tokenId) external view returns(address);
    function isApprovedForAll(address owner, address operator) external view returns(bool);

}