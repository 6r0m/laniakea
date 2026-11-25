// SPDX-License-Identifier: MIT

#include "Standings/SampleRelayStandings.h"
#include "Modules/ModuleManager.h"

SampleRelay::Standings::EHeatWinner SampleRelay::Standings::PlaceResults(
	const Match::FMatchSummary& First, const Match::FMatchSummary& Second)
{
	if (Match::RanksAhead(First, Second))
	{
		return EHeatWinner::First;
	}
	if (Match::RanksAhead(Second, First))
	{
		return EHeatWinner::Second;
	}
	return First.bAccepted ? EHeatWinner::Tie : EHeatWinner::NoResult;
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleStandings)
