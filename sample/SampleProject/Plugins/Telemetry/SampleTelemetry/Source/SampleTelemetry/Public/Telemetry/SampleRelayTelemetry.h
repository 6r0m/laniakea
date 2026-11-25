// SPDX-License-Identifier: MIT

#pragma once

#include "Relay/SampleRelayRound.h"

namespace SampleRelay::Telemetry
{
	struct FRelayMetric
	{
		int32 Score;
		int32 CompletedGates;
		int32 MissedGates;
	};

	SAMPLETELEMETRY_API FRelayMetric MeasureRound(const FSampleRelayRound& Round, int32 Score);
}
