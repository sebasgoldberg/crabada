Prime: 54


4250
8500
12750
38250
76500


```mermaid
graph TB


A1(#5452 bc2 $$$)
B1(#8700 bc2 $$$)
style A1 fill:#AAAAAA
style B1 fill:#AAAAAA

C1(#8224 bc3 T3286)
D1(#4564 bc3 T3286)

A1 -- 4250 --> A2
B1 -- 4250 --> A2
A1 -- 8500 --> B2
B1 -- 8500 --> B2

C1 -- 8500 --> C2
D1 -- 8500 --> C2
C1 -- 12750 --> D2
D1 -- 12750 --> D2


A2(#9217 bc0)
B2(#9787 p2 bc0)
C2(#9309 bc0 T3286)
D2(#9860 p1 bc0)


A2 -- 4250 --> A3
C2 -- 4250 --> A3
A2 -- 8500 --> B3
C2 -- 8500 --> B3

B2 -- 4250 --> C3
D2 -- 4250 --> C3
B2 -- 8500 --> D3
D2 -- 8500 --> D3

A3(#9980 p2 bc0)
style A3 fill:#00AAAA
B3(#9981 p4 bc0)
style B3 fill:#00AAAA

style C3 fill:#AA0000

```


```javascript
28000+28000+28000+20000=104000 // Sell parents
53000-4500=48500 // Exchange 4500 TUS for 105*4 CRA 
104000-8500*2-17000*2=53000 // Breed childs
48500 -> 29.8153 // Convert remaining TUS to AVAX
```

```solidity

interface Crabada{
    event Breed(uint256 tokenId, uint256 daddyId, uint256 mommyId);

    function view crabadaInfo(uint256) returns (uint256 daddyId, uint256 mommyId, uint256 dna, uint64 birthday, breedingCount: uint8);

    function view ownerOf(tokenId: uint256) returns address;
}

interface MarketPlace{

    event BuyCard(uint256 orderId, address buyer, address seller, uint256 cardId, uint256 cardPrice)
    
    function view currentOrderId() returns(uint256);
    
    function view sellOrders(uint256) returns(address owner, uint256 cardId, uint256 cardPrice);
}


```