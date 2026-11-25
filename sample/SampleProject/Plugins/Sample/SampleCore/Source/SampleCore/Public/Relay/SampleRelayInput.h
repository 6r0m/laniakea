// SPDX-License-Identifier: MIT

#pragma once

#include "CoreTypes.h"

namespace SampleRelay::Contracts
{
	inline int32 NormalizeInput(int32 Value)
	{
		return Value < 0 ? 0 : Value;
	}
}
