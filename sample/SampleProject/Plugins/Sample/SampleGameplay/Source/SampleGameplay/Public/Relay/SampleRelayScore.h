// SPDX-License-Identifier: MIT

#pragma once

#include "Relay/SampleRelayRound.h"

namespace SampleRelay::Scoring
{
	SAMPLEGAMEPLAY_API int32 CalculateScore(const FSampleRelayRound& Round);
	SAMPLEGAMEPLAY_API int32 CalculatePreviewScore(int32 RawScore, int32 CompletedGates);
	SAMPLEGAMEPLAY_API int32 PreviewDisplayScore(const FSampleRelayRound& Round);
}
