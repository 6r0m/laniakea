// SPDX-License-Identifier: MIT

#include "Experiment/SampleStreakTrial.h"
#include "Modules/ModuleManager.h"

namespace SampleRelay::Editor
{
	bool TrialChangesScore(int32 RawScore, int32 CompletedGates, int32 MissedGates)
	{
		const Experiment::FStreakTrial Trial = Experiment::RunStreakTrial(RawScore, CompletedGates, MissedGates);
		return Trial.CandidateScore != Trial.BaselineScore;
	}
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleEditor)
