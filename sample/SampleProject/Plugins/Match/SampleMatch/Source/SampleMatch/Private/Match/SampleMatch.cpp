// SPDX-License-Identifier: MIT

#include "Match/SampleMatch.h"
#include "Modules/ModuleManager.h"
#include "Replay/SampleMatchReplay.h"
#include "Relay/SampleRelayScore.h"
#include "Rules/SampleMatchRules.h"
#include "Validation/SampleMatchValidation.h"

namespace SampleRelay::Match
{
	FMatchSummary CloseRound(int32 RawScore, int32 CompletedGates, int32 MissedGates, int32 Streak)
	{
		FSampleRelayRound Round;
		Round.RawScore = RawScore;
		Round.CompletedGates = CompletedGates;
		Round.MissedGates = MissedGates;
		Round.Streak = Streak;
		if (!MatchValidation::AcceptsRound(Round))
		{
			return {};
		}

		const int32 Score = Scoring::CalculateScore(Round);
		const bool bQualified = MatchRules::QualifiesForFinal(Round);
		return {Score, bQualified, Replay::Signature(Round, Score, bQualified), MissedGates, true};
	}
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleMatch)
