// SPDX-License-Identifier: MIT

#pragma once

#include "CoreMinimal.h"
#include "SampleRelayRound.generated.h"

USTRUCT()
struct SAMPLECORE_API FSampleRelayRound
{
	GENERATED_BODY()

	UPROPERTY()
	int32 RawScore = 0;

	UPROPERTY()
	int32 CompletedGates = 0;

	UPROPERTY()
	int32 MissedGates = 0;

	UPROPERTY()
	int32 Streak = 0;
};
