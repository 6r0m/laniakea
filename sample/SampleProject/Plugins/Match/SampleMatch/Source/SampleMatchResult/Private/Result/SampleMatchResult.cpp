// SPDX-License-Identifier: MIT

#include "Result/SampleMatchResult.h"
#include "Modules/ModuleManager.h"

bool SampleRelay::Match::RanksAhead(const FMatchSummary& Left, const FMatchSummary& Right)
{
	if (Left.bAccepted != Right.bAccepted)
	{
		return Left.bAccepted;
	}
	if (!Left.bAccepted)
	{
		return false;
	}
	if (Left.bQualified != Right.bQualified)
	{
		return Left.bQualified;
	}
	if (Left.Score != Right.Score)
	{
		return Left.Score > Right.Score;
	}
	return Left.MissedGates < Right.MissedGates;
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleMatchResult)
