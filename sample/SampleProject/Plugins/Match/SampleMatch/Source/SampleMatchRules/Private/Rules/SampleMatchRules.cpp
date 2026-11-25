// SPDX-License-Identifier: MIT

#include "Rules/SampleMatchRules.h"
#include "Modules/ModuleManager.h"

bool SampleRelay::MatchRules::QualifiesForFinal(const FSampleRelayRound& Round)
{
	constexpr int32 MinimumCompletedGates = 4;
	return Round.CompletedGates >= MinimumCompletedGates && Round.MissedGates >= 0 && Round.MissedGates <= 1;
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleMatchRules)
