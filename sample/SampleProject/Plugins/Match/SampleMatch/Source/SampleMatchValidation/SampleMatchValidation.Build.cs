// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleMatchValidation : ModuleRules
{
	public SampleMatchValidation(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "SampleCore" });
	}
}
