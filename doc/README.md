
# Family Tree
```mermaid
graph BT


A1(#5452 bc2 $$$)
B1(#8700 bc2 $$$)
style A1 fill:#AAAAAA
style B1 fill:#AAAAAA

C1(#8224 bc3 L3873)
style C1 fill:#FF0000
D1(#4564 bc3 L3873)
style D1 fill:#FF0000

A1 -- 4250 --> A2
B1 -- 4250 --> A2
A1 -- 8500 --> B2
B1 -- 8500 --> B2

C1 -- 8500 --> C2
D1 -- 8500 --> C2
C1 -- 12750 --> D2
D1 -- 12750 --> D2


A2(#9217 bc0 M3286)
B2(#9787 p2 bc0 M3286)
C2(#9309 bc0 L3873)
style C2 fill:#FF0000
D2(#9860 p1 bc0 M3286)


A2 -- 4250 --> A3
C2 -- 4250 --> A3
A2 -- 8500 --> B3
C2 -- 8500 --> B3

B2 -- 4250 --> C3
D2 -- 4250 --> C3
B2 -- 8500 --> D3
D2 -- 8500 --> D3

A3(#9980 p2 bc1 M3759)
B3(#9981 p4 bc1 M3759)
C3(#10914 p4 bc1 M3759)
D3(#12269 p4 bc1)



A3 -- 4250 --> A4
C3 -- 4250 --> A4
A3 -- 8500 --> B4
C3 -- 8500 --> B4

B3 -- 4250 --> C4
D3 -- 4250 --> C4
B3 -- 8500 --> D4
D3 -- 8500 --> D4

A4(#13442 bc0 06/01/2022 12:38:56)
B4(#B4 bc0)
C4(#13443 bc0 06/01/2022 12:39:41)
D4(#D4 bc0)

style A4 fill:#00AAAA
style B4 fill:#00AAAA
style C4 fill:#00AAAA
style D4 fill:#00AAAA

A4 -- 4250 --> A5
C4 -- 4250 --> A5
A4 -- 8500 --> B5
C4 -- 8500 --> B5

B4 -- 4250 --> C5
D4 -- 4250 --> C5
B4 -- 8500 --> D5
D4 -- 8500 --> D5

style A5 fill:#00AAAA
style B5 fill:#00AAAA
style C5 fill:#00AAAA
style D5 fill:#00AAAA


```


# Breeding Cost
1. 4250 TUS + 52.5 CRA
1. 8500 TUS + 52.5 CRA
1. 12750 TUS + 52.5 CRA
1. 38250 TUS + 52.5 CRA
1. 76500 TUS + 52.5 CRA

# Deployed Players and Their Teams

## V1
- 0x019e96438ed58C7F18D799b7CC2006273F81318a
  - 3873: 9309,8224,4564
- 0xEFC8536AA8FdE6A7B15910a74b4B679cD94B337f

## V2
- 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd

### Migration Script

```bash
npx hardhat playerdeploy --network mainnet
Player created: 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd

npx hardhat playeraddowner --network mainnet --player 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --newowner 0xE90A22064F415896F1F72e041874Da419390CC6D
npx hardhat playeraddowner --network mainnet --player 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --newowner 0xc7C966754DBE52a29DFD1CCcCBfD2ffBe06B23b2

# Using attacker account as signer
npx hardhat playermigrateteam --network mainnet --playerfrom 0x019e96438ed58C7F18D799b7CC2006273F81318a --playerto 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --accountindex 1 --wait 3

npx hardhat playerlistteams --network mainnet  --player 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd
4400: 9309,8224,4564

// change the attacker contract and team!!!
npx hardhat minestep --network mainnet --minerteamid 3759 --attackercontract 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --attackerteamid 4400 --wait 7
npx hardhat minestep --network mainnet --minerteamid 3286 --attackercontract 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --attackerteamid 4400 --wait 7

npx hardhat playerwithdrawerc20 --network mainnet --player 0x019e96438ed58C7F18D799b7CC2006273F81318a --accountindex 1
```


# Tasks Usage Example
## Localhost
```bash
npx hardhat setupplayertest --network localhost
[ 7929, 7939, 7224 ]

npx hardhat playerdeploy --network localhost --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8
Player created: 0x71C9F079C03bEe608fF19c26B943E599DF115093
npx hardhat playersetapproval --network localhost --player 0x71C9F079C03bEe608fF19c26B943E599DF115093 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8

npx hardhat playerdeposit --network localhost --player 0x71C9F079C03bEe608fF19c26B943E599DF115093 --c1 7929 --c2 7939 --c3 7224 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8
npx hardhat playercreateteam --network localhost --player 0x71C9F079C03bEe608fF19c26B943E599DF115093 --c1 7929 --c2 7939 --c3 7224 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8
Team created: 3785
npx hardhat playerlistteams --network localhost --player 0x71C9F079C03bEe608fF19c26B943E599DF115093
3785: 7929,7939,7224
npx hardhat minestep --network localhost --minerteamid 3286 --attackercontract 0x71C9F079C03bEe608fF19c26B943E599DF115093 --attackerteamid 3785 --wait 1 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8
npx hardhat playerwithdrawerc20 --network localhost --player 0x71C9F079C03bEe608fF19c26B943E599DF115093 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8

npx hardhat playerclosegame --network localhost --player 0x71C9F079C03bEe608fF19c26B943E599DF115093 --teamid 3785 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8
npx hardhat playerremovefromteam --network localhost --player 0x71C9F079C03bEe608fF19c26B943E599DF115093 --teamid 3785 --position 1 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8
npx hardhat playerwithdraw --network localhost --player 0x71C9F079C03bEe608fF19c26B943E599DF115093 --crabadas 7939,7224 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8

# minestep with 5 attackers
npx hardhat minestep --network localhost --minerteamid 3286 --attackercontract 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --attackerteamid 4400 --wait 1 --testmineraccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8 --testattackeraccounts 0xc7C966754DBE52a29DFD1CCcCBfD2ffBe06B23b2,0xE90A22064F415896F1F72e041874Da419390CC6D,0x9568bD1eeAeCCF23f0a147478cEF87434aF0B5d4,0xbfca579D0eB8e294DeAe8C8a94cD3eF3c4836634
```

## Mainnet

### Create Player
```bash
npx hardhat playerdeploy --network mainnet
Player created: 0x019e96438ed58C7F18D799b7CC2006273F81318a
npx hardhat playersetapproval --network mainnet --player 0x019e96438ed58C7F18D799b7CC2006273F81318a
npx hardhat playerdeposit --network mainnet --player 0x019e96438ed58C7F18D799b7CC2006273F81318a --c1 9309 --c2 8224 --c3 4564
npx hardhat playercreateteam --network mainnet --player 0x019e96438ed58C7F18D799b7CC2006273F81318a --c1 9309 --c2 8224 --c3 4564
Team created: 
npx hardhat playerlistteams --network mainnet --player 0x019e96438ed58C7F18D799b7CC2006273F81318a
3873: 9309,8224,4564
npx hardhat minestep --network mainnet --minerteamid 3759 --attackercontract 0x019e96438ed58C7F18D799b7CC2006273F81318a --attackerteamid 3873 --wait 7
npx hardhat playerwithdrawerc20 --network mainnet --player 0x019e96438ed58C7F18D799b7CC2006273F81318a

npx hardhat playerclosegame --network mainnet --player 0x71C9F079C03bEe608fF19c26B943E599DF115093 --teamid 3785 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8
npx hardhat playerremovefromteam --network mainnet --player 0x71C9F079C03bEe608fF19c26B943E599DF115093 --teamid 3785 --position 1 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8
npx hardhat playerwithdraw --network mainnet --player 0x71C9F079C03bEe608fF19c26B943E599DF115093 --crabadas 7939,7224 --testaccount 0xB2f4C513164cD12a1e121Dc4141920B805d024B8
```

### Player: Change Crabada
```bash
# Remove of 4564
npx hardhat playerlistteams --network mainnet --player 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd
npx hardhat settlegame --network mainnet --teamid 4400
npx hardhat playerremovefromteam --network mainnet --player 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --teamid 4400 --position 2 # In position 2: 4564
npx hardhat playersetapproval --network mainnet --player 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd
npx hardhat playerdeposit --network mainnet --player 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --crabadas 12777
npx hardhat playeraddtoteam --network mainnet --player 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --teamid 4400 --position 2 --crabada 12777
npx hardhat playerlistteams --network mainnet --player 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd

# optional withdraw
npx hardhat playerwithdraw --network mainnet --player 0x39A9551C9683d9955ADA8f91438eB18CEd8DbFcd --crabadas 12777
```


# Crabada Contracts Interfaces
```solidity

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

interface IIddleGame {

    function withdraw(address to, uint256[] calldata crabadaIds) external;
    function deposit(uint256[] calldata crabadaIds) external;
    function createTeam(uint256 crabadaId1, uint256 crabadaId2, uint256 crabadaId3) external returns(uint256 teamId);
    function addCrabadaToTeam(uint256 teamId, uint256 position, uint256 crabadaId) external;
    function removeCrabadaFromTeam(uint256 teamId, uint256 position) external;
    function attack(uint256 gameId, uint256 attackTeamId) external;

    function startGame(uint256 teamId) external;
    function closeGame(uint256 gameId) external;
    function settleGame(uint256 gameId) external;

    function getStats(uint256 crabadaId) external view returns(uint16 battlePoint, uint16 timePoint);
    function getTeamInfo(uint256 teamId) external view returns(address owner, uint256 crabadaId1, uint256 crabadaId2, uint256 crabadaId3, uint16 battlePoint, uint16 timePoint, uint256 currentGameId, uint128 lockTo);
    function ownerOf(uint256 crabadaId) external view returns(address);

    function setLendingPrice(uint256 crabadaId, uint256 price) external;

}

interface MarketPlace{

    event BuyCard(uint256 orderId, address buyer, address seller, uint256 cardId, uint256 cardPrice)
    
    function view currentOrderId() returns(uint256);
    
    function view sellOrders(uint256) returns(address owner, uint256 cardId, uint256 cardPrice);
}


```
