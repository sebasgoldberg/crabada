import { BigNumber, Contract } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getCrabadaContracts } from "./crabada";

export type CrabadaClassName = 'SURGE' | 'SUNKEN' | 'PRIME' | 'BULK' | 'CRABOID' | 'RUINED' | 'GEM' | 'ORGANIC'

export const classNameFromDna = (dna: BigNumber): CrabadaClassName => {

    const hexDna = dna.toHexString()
    const hexClass = hexDna.slice(4,6)
    const subClass = Number('0x'+hexClass)

    if (subClass < 1 || subClass >= 114)
        throw new Error(`Subclass ${ '0x'+hexClass } not valid. DNA: ${dna.toHexString()}`);

    return (
        subClass < 16 ? 'SURGE' 
        : subClass < 31 ? 'SUNKEN' 
        : subClass < 46 ? 'PRIME' 
        : subClass < 61 ? 'BULK' 
        : subClass < 76 ? 'CRABOID' 
        : subClass < 91 ? 'RUINED' 
        : subClass < 106 ? 'GEM' 
        : 'ORGANIC'
    )

}

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

export const LOOTERS_FACTION: TeamFaction = "LUX"

const USE_LOOTERS_ADVANTAGE = false

const ADVANTAGE_MATRIX: AdvantagesByFaction = {
    LUX: USE_LOOTERS_ADVANTAGE ? [ "ORE", "FAERIES" ] : [],
    FAERIES: [ "ORE", "ABYSS" ],
    ORE: [ "ABYSS", "TRENCH" ],
    ABYSS: [ "TRENCH", "MACHINE" ],
    TRENCH: [ "MACHINE", "LUX" ],
    MACHINE: [ "LUX", "FAERIES" ],
    "NO FACTION": []
}

export interface ClassNameByCrabada {
    [crabada: string]: CrabadaClassName;
}

const MIN_VALID_BATTLE_POINTS = 564
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

    static async createFromTeamId(
        idleGame: Contract, teamId: BigNumber|number, 
        classNameByCrabada: ClassNameByCrabada){

        const { battlePoint, crabadaId1, crabadaId2, crabadaId3 }:
        { battlePoint: number, crabadaId1: BigNumber, 
            crabadaId2: BigNumber, crabadaId3: BigNumber } = 
                await idleGame.getTeamInfo(teamId)
                
        return TeamBattlePoints.createFromCrabadaIds(
            battlePoint, crabadaId1, crabadaId2, crabadaId3, classNameByCrabada
        )
    }

    static createFromCrabadaIds(
        realBP: number,
        crabada1: BigNumber, crabada2: BigNumber, crabada3: BigNumber,
        classNameByCrabada: ClassNameByCrabada
        ): TeamBattlePoints{

        const classNames: CrabadaClassName[] = [ crabada1, crabada2, crabada3 ]
            .map(crabadaId => classNameByCrabada[crabadaId.toString()])
            .filter(className => className)
        
        if (classNames.length < 3)
            return undefined

        return this.createFromMembersClasses(
            realBP,
            classNames[0], classNames[1], classNames[2], 
        )

    }

    static async createFromCrabadaIdsAsync(
        hre: HardhatRuntimeEnvironment,
        realBP: number,
        crabada1: BigNumber, crabada2: BigNumber, crabada3: BigNumber
        ): Promise<TeamBattlePoints>{

        const { crabada } = getCrabadaContracts(hre)

        const classNames: CrabadaClassName[] = (await Promise.all(
            [ crabada1, crabada2, crabada3 ]
                .map(async crabadaId => {
                    const { dna } = await crabada.crabadaInfo(crabadaId)
                    try {
                        return classNameFromDna(dna)
                    } catch (error) {
                        return undefined
                    }
                })
        ))
        .filter(className => className)
        
        if (classNames.length < 3)
            return undefined

        return this.createFromMembersClasses(
            realBP,
            classNames[0], classNames[1], classNames[2], 
        )

    }

    isValid(): boolean{
        return this.realBP >= MIN_VALID_BATTLE_POINTS
    }

    hasAdvantageOverFaction(otherTeamFaction: TeamFaction){
        return ADVANTAGE_MATRIX[this.teamFaction].includes(otherTeamFaction)
    }

    getRelativeBP(otherTeamFaction: TeamFaction): number{

        if (this.teamFaction == "NO FACTION")
            return Math.floor(0.97 * this.realBP)

        if (ADVANTAGE_MATRIX[otherTeamFaction].includes(this.teamFaction))
            return Math.floor(0.93 * this.realBP)
        
        return this.realBP

    }

    getRelativeBPForAdvantage(hasDisadvantage: boolean): number{

        if (this.teamFaction == "NO FACTION")
            return Math.floor(0.97 * this.realBP)

        if (hasDisadvantage)
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
        return (bp.lt(this))
    }

    gte(bp: TeamBattlePoints){
        return (bp.lte(this))
    }

}
