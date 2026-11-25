// SPDX-License-Identifier: MIT

#include "Session/SampleRelaySession.h"
#include "Modules/ModuleManager.h"
#include "Match/SampleMatch.h"

SampleRelay::Match::FMatchSummary SampleRelay::Session::SubmitAttempt(FRelayAttempt& Attempt)
{
	if (Attempt.bClosed)
	{
		return {};
	}

	const Match::FMatchSummary Summary =
		Match::CloseRound(Attempt.RawScore, Attempt.CompletedGates, Attempt.MissedGates, Attempt.Streak);
	Attempt.bClosed = Summary.bAccepted;
	return Summary;
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleSession)
