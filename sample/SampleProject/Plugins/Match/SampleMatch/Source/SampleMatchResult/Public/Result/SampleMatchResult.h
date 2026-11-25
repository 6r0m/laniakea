// SPDX-License-Identifier: MIT

#pragma once

#include "CoreTypes.h"

namespace SampleRelay::Match
{
	struct FMatchSummary
	{
		int32 Score = 0;
		bool bQualified = false;
		uint32 ReplaySignature = 0;
		int32 MissedGates = 0;
		bool bAccepted = false;
	};

	SAMPLEMATCHRESULT_API bool RanksAhead(const FMatchSummary& Left, const FMatchSummary& Right);
}
