// SPDX-License-Identifier: MIT

#include "Legacy/SampleLegacySession.h"
#include "Legacy/SampleLegacyStats.h"
#include "Modules/ModuleManager.h"

int32 SampleRelay::LegacySession::ReadArchivedScore(int32 Score)
{
	return LegacyStats::ClampArchivedScore(Score);
}

int32 SampleRelay::LegacySession::ArchivedScoreLimit()
{
	return 999;
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleLegacySession)
