// SPDX-License-Identifier: MIT

#pragma once

#include "CoreMinimal.h"

/** A value type the other sample modules share. */
struct SAMPLECORE_API FSampleId
{
	int32 Value = 0;
};

SAMPLECORE_API int32 SampleNormalize(int32 Value);

class SAMPLECORE_API FSampleProcessor
{
public:
	virtual ~FSampleProcessor() = default;
	virtual int32 Process(const FSampleId& Id) const;
};
