// SPDX-License-Identifier: AGPL-3.0-or-later

#pragma once

#include "SampleCoreTypes.h"

class SAMPLEGAMEPLAY_API FSampleGameplayProcessor : public FSampleProcessor
{
public:
	int32 Process(const FSampleId& Id) const override;
};
