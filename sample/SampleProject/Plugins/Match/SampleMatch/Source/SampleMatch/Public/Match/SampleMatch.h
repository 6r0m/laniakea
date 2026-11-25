// SPDX-License-Identifier: MIT

#pragma once

#include "Result/SampleMatchResult.h"

namespace SampleRelay::Match
{
	SAMPLEMATCH_API FMatchSummary CloseRound(int32 RawScore, int32 CompletedGates, int32 MissedGates, int32 Streak);
}
