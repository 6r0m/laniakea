// SPDX-License-Identifier: MIT

#include "Results/SampleHeatResult.h"
#include "Modules/ModuleManager.h"

SampleRelay::Standings::EHeatWinner SampleRelay::Results::FinishHeat(
	Session::FRelayAttempt& First, Session::FRelayAttempt& Second)
{
	const Match::FMatchSummary FirstResult = Session::SubmitAttempt(First);
	const Match::FMatchSummary SecondResult = Session::SubmitAttempt(Second);
	return Standings::PlaceResults(FirstResult, SecondResult);
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleResults)
