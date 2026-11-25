// SPDX-License-Identifier: MIT

#pragma once

#include "CoreTypes.h"

namespace SampleRelay::Experiment
{
	struct FStreakTrial
	{
		int32 BaselineScore;
		int32 CandidateScore;
	};

	SAMPLEEXPERIMENT_API FStreakTrial RunStreakTrial(int32 RawScore, int32 CompletedGates, int32 MissedGates);
}
