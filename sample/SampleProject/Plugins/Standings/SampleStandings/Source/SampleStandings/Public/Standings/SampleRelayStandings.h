// SPDX-License-Identifier: MIT

#pragma once

#include "Result/SampleMatchResult.h"

namespace SampleRelay::Standings
{
	enum class EHeatWinner : uint8
	{
		NoResult,
		First,
		Second,
		Tie
	};

	SAMPLESTANDINGS_API EHeatWinner PlaceResults(const Match::FMatchSummary& First, const Match::FMatchSummary& Second);
}
