export type CrabadaClassName = 'SURGE' | 'SUNKEN' | 'PRIME' | 'BULK' | 'CRABOID' | 'RUINED' | 'GEM' | 'ORGANIC'

export type TeamFaction = 'ABYSS' | 'TRENCH' | 'ORE' | 'LUX' | 'MACHINE' | 'FAERIES' | 'NO FACTION'

const FACTIONS: TeamFaction[] = [ 'ABYSS' , 'TRENCH' , 'ORE' , 'LUX' , 'MACHINE' , 'FAERIES' ]

type FactionByClassName = {
    [className in CrabadaClassName]: TeamFaction;
};
const FACTION_BY_CLASS_NAME: FactionByClassName = {
    'RUINED': 'ABYSS',
    'SUNKEN': 'TRENCH',
    'SURGE': 'ORE',
    'BULK': 'ORE',
    'PRIME': 'LUX',
    'GEM': 'LUX',
    'CRABOID': 'MACHINE',
    'ORGANIC': 'FAERIES',
}

export const getTeamFaction = (
    crabada1ClassName: CrabadaClassName, crabada2ClassName: CrabadaClassName, 
    crabada3ClassName: CrabadaClassName): TeamFaction => {

    const teamClassNames: CrabadaClassName[] = [
        crabada1ClassName, crabada2ClassName, crabada3ClassName
    ]

    const membersFaction: TeamFaction[] = teamClassNames.map( teamClassName => FACTION_BY_CLASS_NAME[teamClassName] )

    interface QuanByFaction {
        [faction: string]: number
    }

    const quanByFaction: QuanByFaction = {}
    
    for (const faction of membersFaction){
        
        quanByFaction[faction] = quanByFaction[faction] || 0
        quanByFaction[faction]++

        if (quanByFaction[faction] >= 2)
            return faction as TeamFaction

    }

    return "NO FACTION"

}

type AdvantagesByFaction = {
    [factionThatHasTheAdvantage in TeamFaction]: TeamFaction[]
};


const ADVANTAGE_MATRIX: AdvantagesByFaction = {
    LUX: [ "ORE", "FAERIES" ],
    FAERIES: [ "ORE", "ABYSS" ],
    ORE: [ "ABYSS", "TRENCH" ],
    ABYSS: [ "TRENCH", "MACHINE" ],
    TRENCH: [ "MACHINE", "LUX" ],
    MACHINE: [ "LUX", "FAERIES" ],
    "NO FACTION": []
}

export class TeamBattlePoints{

    teamFaction: TeamFaction
    realBP: number

    constructor(teamFaction: TeamFaction, realBP: number){
        this.teamFaction = teamFaction
        this.realBP = realBP
    }

    static createFromMembersClasses(
        realBP: number,
        crabada1ClassName: CrabadaClassName, crabada2ClassName: CrabadaClassName, 
        crabada3ClassName: CrabadaClassName): TeamBattlePoints{

        return new TeamBattlePoints(
            getTeamFaction(crabada1ClassName, crabada2ClassName, crabada3ClassName),
            realBP
        )

    }

    getRelativeBP(otherTeamFaction: TeamFaction): number{

        if (this.teamFaction == "NO FACTION")
            return Math.floor(0.97 * this.realBP)

        if (ADVANTAGE_MATRIX[otherTeamFaction].includes(this.teamFaction))
            return Math.floor(0.93 * this.realBP)
        
        return this.realBP

    }

    lt(bp: TeamBattlePoints){
        return this.getRelativeBP(bp.teamFaction) < bp.getRelativeBP(this.teamFaction)
    }

    lte(bp: TeamBattlePoints){
        return this.getRelativeBP(bp.teamFaction) <= bp.getRelativeBP(this.teamFaction)
    }

    gt(bp: TeamBattlePoints){
        return (!this.lte(bp))
    }

    gte(bp: TeamBattlePoints){
        return (!this.lt(bp))
    }

}
