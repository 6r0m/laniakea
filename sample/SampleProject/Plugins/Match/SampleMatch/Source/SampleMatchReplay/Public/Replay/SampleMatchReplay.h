// SPDX-License-Identifier: MIT

#pragma once

#include "Relay/SampleRelayRound.h"

namespace SampleRelay::Replay
{
	SAMPLEMATCHREPLAY_API uint32 Signature(const FSampleRelayRound& Round, int32 Score, bool bQualified);
}
