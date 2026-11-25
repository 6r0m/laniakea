// SPDX-License-Identifier: MIT

#include "Modules/ModuleManager.h"
#include "Relay/SampleRelayInput.h"
#include "SampleCoreTypes.h"

int32 SampleNormalize(int32 Value)
{
	return SampleRelay::Contracts::NormalizeInput(Value);
}

int32 FSampleProcessor::Process(const FSampleId& Id) const
{
	return SampleNormalize(Id.Value);
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleCore)
