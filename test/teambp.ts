import * as hre from "hardhat"
import { expect } from "chai";
import { TeamBattlePoints } from "../scripts/teambp";

// Start test block
describe('Team BP & Factions', function () {

  beforeEach(async function () {

  });

  it('should work the example https://docs.crabada.com/game-guide/factional-advantage-guide#example-of-factional-advantage-in-the-idle-game.', async function () {

    const teamWithAdvantage = TeamBattlePoints.createFromMembersClasses(631, 'CRABOID', 'CRABOID', 'RUINED')

    const teamWithDisadvantage = TeamBattlePoints.createFromMembersClasses(677, 'PRIME', 'PRIME', 'GEM')

    expect(
      teamWithAdvantage.teamFaction
      ).to.eq('MACHINE')

    expect(
      teamWithDisadvantage.teamFaction
      ).to.eq('LUX')

    expect(
      teamWithAdvantage.getRelativeBP(teamWithDisadvantage.teamFaction)
      ).to.eq(631)

    expect(
      teamWithDisadvantage.getRelativeBP(teamWithAdvantage.teamFaction)
      ).to.eq(629)

    expect(
      teamWithDisadvantage.lt(teamWithAdvantage)
      ).to.be.true
  
    expect(
      teamWithDisadvantage.lte(teamWithAdvantage)
      ).to.be.true
  
    expect(
      teamWithAdvantage.gt(teamWithDisadvantage)
      ).to.be.true
  
    expect(
      teamWithAdvantage.gte(teamWithDisadvantage)
      ).to.be.true
  
  });

  it('lte should work as expected.', async function () {

    const teamWithAdvantage = TeamBattlePoints.createFromMembersClasses(631, 'CRABOID', 'CRABOID', 'RUINED')

    const teamWithDisadvantage = TeamBattlePoints.createFromMembersClasses(679, 'PRIME', 'PRIME', 'GEM')

    expect(
      teamWithAdvantage.teamFaction
      ).to.eq('MACHINE')

    expect(
      teamWithDisadvantage.teamFaction
      ).to.eq('LUX')

    expect(
      teamWithAdvantage.getRelativeBP(teamWithDisadvantage.teamFaction)
      ).to.eq(631)

    expect(
      teamWithDisadvantage.getRelativeBP(teamWithAdvantage.teamFaction)
      ).to.eq(631)

    expect(
      teamWithDisadvantage.lt(teamWithAdvantage)
      ).to.be.false
  
    expect(
      teamWithDisadvantage.lte(teamWithAdvantage)
      ).to.be.true

    expect(
      teamWithAdvantage.gt(teamWithDisadvantage)
      ).to.be.false
  
    expect(
      teamWithAdvantage.gte(teamWithDisadvantage)
      ).to.be.true

  });

  it('teams with same faction should not represent any (dis)advantage.', async function () {

    const teamWithAdvantage = TeamBattlePoints.createFromMembersClasses(665, 'GEM', 'PRIME', 'GEM')

    const teamWithDisadvantage = TeamBattlePoints.createFromMembersClasses(665, 'PRIME', 'PRIME', 'GEM')

    expect(
      teamWithAdvantage.teamFaction
      ).to.eq('LUX')

    expect(
      teamWithDisadvantage.teamFaction
      ).to.eq('LUX')

    expect(
      teamWithAdvantage.getRelativeBP(teamWithDisadvantage.teamFaction)
      ).to.eq(665)

    expect(
      teamWithDisadvantage.getRelativeBP(teamWithAdvantage.teamFaction)
      ).to.eq(665)

    expect(
      teamWithDisadvantage.lt(teamWithAdvantage)
      ).to.be.false
  
    expect(
      teamWithDisadvantage.lte(teamWithAdvantage)
      ).to.be.true
  
  });

  it('teams with oposite factions should not represent any (dis)advantage.', async function () {

    const teamWithAdvantage = TeamBattlePoints.createFromMembersClasses(667, 'GEM', 'PRIME', 'BULK')

    const teamWithDisadvantage = TeamBattlePoints.createFromMembersClasses(667, 'RUINED', 'PRIME', 'RUINED')

    expect(
      teamWithAdvantage.teamFaction
      ).to.eq('LUX')

    expect(
      teamWithDisadvantage.teamFaction
      ).to.eq('ABYSS')

    expect(
      teamWithAdvantage.getRelativeBP(teamWithDisadvantage.teamFaction)
      ).to.eq(667)

    expect(
      teamWithDisadvantage.getRelativeBP(teamWithAdvantage.teamFaction)
      ).to.eq(667)

    expect(
      teamWithDisadvantage.lt(teamWithAdvantage)
      ).to.be.false
  
    expect(
      teamWithDisadvantage.lte(teamWithAdvantage)
      ).to.be.true
  
  });

  it('teams with faction should have an advantage over teams with no faction.', async function () {

    const teamWithAdvantage = TeamBattlePoints.createFromMembersClasses(670, 'GEM', 'PRIME', 'BULK')

    const teamWithDisadvantage = TeamBattlePoints.createFromMembersClasses(690, 'RUINED', 'GEM', 'BULK')

    expect(
      teamWithAdvantage.teamFaction
      ).to.eq('LUX')

    expect(
      teamWithDisadvantage.teamFaction
      ).to.eq('NO FACTION')

    expect(
      teamWithAdvantage.getRelativeBP(teamWithDisadvantage.teamFaction)
      ).to.eq(670)

    expect(
      teamWithDisadvantage.getRelativeBP(teamWithAdvantage.teamFaction)
      ).to.eq(669)

    expect(
      teamWithDisadvantage.lt(teamWithAdvantage)
      ).to.be.true
  
    expect(
      teamWithDisadvantage.lte(teamWithAdvantage)
      ).to.be.true
  
  });

  it('both teams with no faction should not represent any (dis)advantage.', async function () {

    const teamWithAdvantage = TeamBattlePoints.createFromMembersClasses(667, 'CRABOID', 'PRIME', 'BULK')

    const teamWithDisadvantage = TeamBattlePoints.createFromMembersClasses(667, 'GEM', 'ORGANIC', 'RUINED')

    expect(
      teamWithAdvantage.teamFaction
      ).to.eq('NO FACTION')

    expect(
      teamWithDisadvantage.teamFaction
      ).to.eq('NO FACTION')

    expect(
      teamWithAdvantage.getRelativeBP(teamWithDisadvantage.teamFaction)
      ).to.eq(646)

    expect(
      teamWithDisadvantage.getRelativeBP(teamWithAdvantage.teamFaction)
      ).to.eq(646)

    expect(
      teamWithDisadvantage.lt(teamWithAdvantage)
      ).to.be.false
  
    expect(
      teamWithDisadvantage.lte(teamWithAdvantage)
      ).to.be.true
  
  });

});