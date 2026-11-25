// SPDX-License-Identifier: MIT

#include "Validation/SampleMatchValidation.h"
#include "Modules/ModuleManager.h"

bool SampleRelay::MatchValidation::AcceptsRound(const FSampleRelayRound& Round)
{
	return Round.RawScore >= 0 && Round.CompletedGates >= 0 && Round.MissedGates >= 0
		&& Round.Streak >= 0 && Round.Streak <= Round.CompletedGates;
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleMatchValidation)
