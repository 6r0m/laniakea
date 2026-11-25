// SPDX-License-Identifier: MIT

#include "Replay/SampleMatchReplay.h"
#include "Modules/ModuleManager.h"
#include "Telemetry/SampleRelayTelemetry.h"

uint32 SampleRelay::Replay::Signature(const FSampleRelayRound& Round, int32 Score, bool bQualified)
{
	const Telemetry::FRelayMetric Metric = Telemetry::MeasureRound(Round, Score);
	uint32 Signature = static_cast<uint32>(Metric.Score);
	Signature = Signature * 31u + static_cast<uint32>(Metric.CompletedGates);
	Signature = Signature * 31u + static_cast<uint32>(Metric.MissedGates);
	return Signature * 31u + (bQualified ? 1u : 0u);
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleMatchReplay)
