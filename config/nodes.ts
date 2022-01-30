
interface AccountConfig{
    accountIndex: number,
    teams: number[]
}

export interface NodeConfig {
    accountsConfigs: AccountConfig[]
}

export interface ConfigByNodeId {
    [nodeId: number]: NodeConfig
}

const main: AccountConfig = {
    accountIndex: 0,
    teams: [3286, 3759, 5032]
}

const looter1: AccountConfig = {
    accountIndex: 1,
    teams: [5355, 5357, 6152]
}

const looter2: AccountConfig = {
    accountIndex: 2,
    teams: [7449, 8157]
}


export const CONFIG_BY_NODE_ID: ConfigByNodeId = {
    1: { accountsConfigs: [
        {
            accountIndex: 0,
            teams: [3759, 5032]
        },
    ] },
    2: { accountsConfigs: [ 
        {
            accountIndex: 0,
            teams: [3286]
        },
        {
            accountIndex: 1,
            teams: [6152]
        }
     ] },
    4: { accountsConfigs: [ 
        {
            accountIndex: 1,
            teams: [5355]
        },
        {
            accountIndex: 2,
            teams: [7449]
        }
     ]},
    5: { accountsConfigs: [ 
        {
            accountIndex: 1,
            teams: [5357]
        }
     ] },
    9: { accountsConfigs: [ 
        {
            accountIndex: 2,
            teams: [8157]
        }
     ] },
    //11: { accountsConfigs: [ looter2, main, looter1 ]},
}