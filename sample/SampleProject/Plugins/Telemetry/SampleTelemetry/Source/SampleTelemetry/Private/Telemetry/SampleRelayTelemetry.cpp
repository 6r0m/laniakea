// SPDX-License-Identifier: MIT

#include "Telemetry/SampleRelayTelemetry.h"
#include "Modules/ModuleManager.h"
#include "Relay/SampleRelayInput.h"

SampleRelay::Telemetry::FRelayMetric SampleRelay::Telemetry::MeasureRound(const FSampleRelayRound& Round, int32 Score)
{
	return {Contracts::NormalizeInput(Score), Contracts::NormalizeInput(Round.CompletedGates),
		Contracts::NormalizeInput(Round.MissedGates)};
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleTelemetry)
