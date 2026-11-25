// SPDX-License-Identifier: MIT

#include "Experiment/SampleStreakTrial.h"
#include "Match/SampleMatch.h"
#include "Modules/ModuleManager.h"
#include "Relay/SampleRelayScore.h"
#include "Telemetry/SampleRelayTelemetry.h"

namespace SampleRelay::Experiment
{
	FStreakTrial RunStreakTrial(int32 RawScore, int32 CompletedGates, int32 MissedGates)
	{
		const Match::FMatchSummary Baseline = Match::CloseRound(RawScore, CompletedGates, MissedGates, 0);
		if (!Baseline.bAccepted)
		{
			return {};
		}
		FSampleRelayRound Candidate;
		Candidate.RawScore = RawScore;
		Candidate.CompletedGates = CompletedGates;
		Candidate.MissedGates = MissedGates;
		Candidate.Streak = FMath::Clamp(CompletedGates, 0, 4);
		const int32 CandidateScore = Scoring::CalculateScore(Candidate);
		const Telemetry::FRelayMetric Metric = Telemetry::MeasureRound(Candidate, CandidateScore);
		return {Baseline.Score, Metric.Score};
	}
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleExperiment)
