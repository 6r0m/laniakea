// SPDX-License-Identifier: MIT

#include "Legacy/SampleLegacyStats.h"
#include "Legacy/SampleLegacySession.h"
#include "Relay/SampleRelayInput.h"
#include "Math/UnrealMathUtility.h"
#include "Modules/ModuleManager.h"

int32 SampleRelay::LegacyStats::ClampArchivedScore(int32 Score)
{
	return FMath::Min(Contracts::NormalizeInput(Score), LegacySession::ArchivedScoreLimit());
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleLegacyStats)
