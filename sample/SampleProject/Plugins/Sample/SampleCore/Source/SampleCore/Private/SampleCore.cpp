// SPDX-License-Identifier: AGPL-3.0-or-later

#include "Modules/ModuleManager.h"
#include "SampleCoreTypes.h"

int32 SampleNormalize(int32 Value)
{
	return FMath::Max(Value, 0);
}

int32 FSampleProcessor::Process(const FSampleId& Id) const
{
	return SampleNormalize(Id.Value);
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleCore)
