
export type LootersTeamsByAccountIndex = Array<Array<number>> // each element are the looters teams for the respective account index

export interface ConfigByNodeId {
    [nodeId: number]: LootersTeamsByAccountIndex
}

export const CONFIG_BY_NODE_ID: ConfigByNodeId = {
    1: [[], [5355, 5357, 6152], []],//[7449]],
    2: [[3286, 3759, 5032], [5355, 5357, 6152], []],
    4: [[], [5355, 5357, 6152], []],//[7449]],
    5: [[3286, 3759, 5032], [5355, 5357, 6152], []],
    6: [[], [5355, 5357, 6152], []],
    9: [[3286, 3759, 5032], [5355, 5357, 6152], []],
    10: [[], [5355, 5357, 6152], []],
}