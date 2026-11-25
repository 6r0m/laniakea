// SPDX-License-Identifier: MIT

using System.IO;
using UnrealBuildTool;

public class SampleLegacyStats : ModuleRules
{
	public SampleLegacyStats(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.Add("Core");
		PrivateDependencyModuleNames.Add("SampleLegacySession");
		CircularlyReferencedDependentModules.Add("SampleLegacySession");
		PrivateIncludePaths.Add(Path.GetFullPath(Path.Combine(PluginDirectory, "..", "..", "..",
			"Sample", "SampleCore", "Source", "SampleCore", "Public")));
	}
}
