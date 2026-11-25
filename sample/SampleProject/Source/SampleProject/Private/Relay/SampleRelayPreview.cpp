// SPDX-License-Identifier: MIT

#include "Experiment/SampleStreakTrial.h"
#include "Relay/SampleRelayInput.h"
#include "Relay/SampleRelayScore.h"
#include "Match/SampleMatch.h"
#include "Results/SampleHeatResult.h"

namespace SampleRelay
{
	int32 PreviewRound(int32 RawScore, int32 CompletedGates)
	{
		const auto Normalize = &Contracts::NormalizeInput;
		return Scoring::CalculatePreviewScore(Normalize(RawScore), Contracts::NormalizeInput(CompletedGates));
	}

	uint32 PreviewMatchReplay(int32 RawScore, int32 CompletedGates)
	{
		return Match::CloseRound(RawScore, CompletedGates, 0, 0).ReplaySignature;
	}

	int32 PreviewTrialScore(int32 RawScore, int32 CompletedGates, int32 MissedGates)
	{
		return Experiment::RunStreakTrial(RawScore, CompletedGates, MissedGates).CandidateScore;
	}

	Standings::EHeatWinner PreviewHeatWinner(int32 FirstScore, int32 SecondScore)
	{
		Session::FRelayAttempt First{FirstScore, 5, 0, 2};
		Session::FRelayAttempt Second{SecondScore, 4, 1, 1};
		return Results::FinishHeat(First, Second);
	}
}
