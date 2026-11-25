// SPDX-License-Identifier: MIT

#pragma once

#include "Result/SampleMatchResult.h"

namespace SampleRelay::Session
{
	struct FRelayAttempt
	{
		int32 RawScore = 0;
		int32 CompletedGates = 0;
		int32 MissedGates = 0;
		int32 Streak = 0;
		bool bClosed = false;
	};

	SAMPLESESSION_API Match::FMatchSummary SubmitAttempt(FRelayAttempt& Attempt);
}
