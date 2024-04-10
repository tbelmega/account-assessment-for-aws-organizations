#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#

[ "$DEBUG" == 'true' ] && set -x

# Check to see if the required parameters have been provided:
if [ -z "$1" ]; then
    echo "Please provide the trademark approved solution name for the open source package."
    echo "For example: ./build-open-source-dist.sh trademarked-solution-name"
    exit 1
fi

# Get reference for all important folders
deployment_dir="$PWD"
dist_dir="$deployment_dir/open-source"
source_dir="$deployment_dir/../source"
docs_dir="$deployment_dir/../docs"
github_dir="$deployment_dir/../.github"
support_stack_dir="$deployment_dir/../deployment-prerequisties"

echo "------------------------------------------------------------------------------"
echo "[Init] Remove any old dist files from previous runs"
echo "------------------------------------------------------------------------------"

rm -rf $dist_dir
mkdir -p $dist_dir

echo "------------------------------------------------------------------------------"
echo "[Packing] GitHub templates"
echo "------------------------------------------------------------------------------"

cp -r $github_dir $dist_dir

echo "------------------------------------------------------------------------------"
echo "[Packing] Source folder"
echo "------------------------------------------------------------------------------"

cp -r $source_dir $dist_dir

echo "------------------------------------------------------------------------------"
echo "[Packing] cross account support folder"
echo "------------------------------------------------------------------------------"

cp -r $support_stack_dir $dist_dir

echo "------------------------------------------------------------------------------"
echo "[Packing] Files from deployment folder"
echo "------------------------------------------------------------------------------"

mkdir $dist_dir/deployment

cp $docs_dir/architecture.png $docs_dir/docs/

cp $deployment_dir/build-s3-dist.sh $dist_dir/deployment/
cp $deployment_dir/build-lambdas.sh $dist_dir/deployment/
cp -r $deployment_dir/manifest-generator $dist_dir/deployment/
cp -r $deployment_dir/cdk-solution-helper $dist_dir/deployment/
cp -r $deployment_dir/solution_config $dist_dir/deployment/

echo "------------------------------------------------------------------------------"
echo "[Packing] Files from the root level of the project"
echo "------------------------------------------------------------------------------"

cp $deployment_dir/../LICENSE.txt $dist_dir
cp $deployment_dir/../NOTICE.txt $dist_dir
cp $deployment_dir/../README.md $dist_dir
cp $deployment_dir/../CODE_OF_CONDUCT.md $dist_dir
cp $deployment_dir/../CONTRIBUTING.md $dist_dir
cp $deployment_dir/../CHANGELOG.md $dist_dir
cp $deployment_dir/../.gitignore $dist_dir

echo "------------------------------------------------------------------------------"
echo "[Packing] Clean up the open-source distributable"
echo "------------------------------------------------------------------------------"
echo $dist_dir
# General cleanup of node_modules and package-lock.json files
find $dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null
find $dist_dir -iname ".venv" -type d -exec rm -rf "{}" \; 2> /dev/null
find $dist_dir -iname "pytest_cache" -type d -exec rm -rf "{}" \; 2> /dev/null
find $dist_dir -iname ".mypy_cache" -type d -exec rm -rf "{}" \; 2> /dev/null
find $dist_dir -iname ".viperlightignore" -type d -exec rm -rf "{}" \; 2> /dev/null
find $dist_dir -iname "cdk.out" -type d -exec rm -rf "{}" \; 2> /dev/null
find $dist_dir -iname "dist" -type d -exec rm -rf "{}" \; 2> /dev/null
find $dist_dir -iname "coverage" -type d -exec rm -rf "{}" \; 2> /dev/null
find $dist_dir -iname "coverage.xml" -type d -exec rm -rf "{}" \; 2> /dev/null

echo "------------------------------------------------------------------------------"
echo "[Packing] Create GitHub (open-source) zip file"
echo "------------------------------------------------------------------------------"

# Create the zip file
echo "cd $dist_dir"
cd $dist_dir
echo "zip -q -r9 ../$1.zip ."
zip -q -r9 ../$1.zip .

# Cleanup any temporary/unnecessary files
echo "Clean up open-source folder"
echo "rm -rf .*"
rm -rf .*

# Place final zip file in $dist_dir
echo "mv ../$1.zip ."
mv ../$1.zip .

echo "Completed building $1.zip dist"