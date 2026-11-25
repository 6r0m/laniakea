// SPDX-License-Identifier: MIT

#include "Relay/SampleRelayScore.h"
#include "Relay/SampleRelayDisplay.h"

namespace SampleRelay::Scoring
{
	static int32 NormalizeRelayScore(int32 RawScore, int32 CompletedGates, int32 MissedGates)
	{
		constexpr int32 MaximumScore = 10000;
		constexpr int32 MaximumGates = 50;
		constexpr int32 GateBonus = 25;
		constexpr int32 MissPenalty = 10;
		constexpr int32 CleanRunBonus = 40;
		constexpr int32 MinimumCleanRunGates = 4;

		const int32 BaseScore = FMath::Clamp(RawScore, 0, MaximumScore);
		const int32 CleanGates = FMath::Clamp(CompletedGates, 0, MaximumGates);
		const int32 Misses = FMath::Clamp(MissedGates, 0, MaximumGates);
		const int32 GateScore = CleanGates * GateBonus;
		const int32 Penalty = Misses * MissPenalty;
		const int32 CleanBonus = Misses == 0 && CleanGates >= MinimumCleanRunGates ? CleanRunBonus : 0;
		return FMath::Clamp(BaseScore + GateScore + CleanBonus - Penalty, 0, MaximumScore);
	}

	static int32 StreakBonus(int32 Streak)
	{
		return Streak > 0 ? Streak + StreakBonus(Streak - 1) : 0;
	}

	int32 CalculateScore(const FSampleRelayRound& Round)
	{
		const int32 BaseScore = NormalizeRelayScore(Round.RawScore, Round.CompletedGates, Round.MissedGates);
		return BaseScore + StreakBonus(FMath::Clamp(Round.Streak, 0, 8));
	}

	int32 CalculatePreviewScore(int32 RawScore, int32 CompletedGates)
	{
		FSampleRelayRound Round;
		Round.RawScore = RawScore;
		Round.CompletedGates = CompletedGates;
		return CalculateScore(Round);
	}

	int32 PreviewDisplayScore(const FSampleRelayRound& Round)
	{
		return Presentation::DisplayScore(Round);
	}
}
