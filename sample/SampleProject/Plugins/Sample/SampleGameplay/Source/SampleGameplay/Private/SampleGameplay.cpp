// SPDX-License-Identifier: MIT

#include "Modules/ModuleManager.h"
#include "SampleGameplayTypes.h"

int32 FSampleGameplayProcessor::Process(const FSampleId& Id) const
{
	return FSampleProcessor::Process(Id) + 1;
}

IMPLEMENT_MODULE(FDefaultModuleImpl, SampleGameplay)
