// SPDX-License-Identifier: MIT

#pragma once

#include "Session/SampleRelaySession.h"
#include "Standings/SampleRelayStandings.h"

namespace SampleRelay::Results
{
	SAMPLERESULTS_API Standings::EHeatWinner FinishHeat(Session::FRelayAttempt& First, Session::FRelayAttempt& Second);
}
