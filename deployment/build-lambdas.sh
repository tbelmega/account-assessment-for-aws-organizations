#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#

[ "$DEBUG" == 'true' ] && set -x
deployment_dir="$PWD"
staging_dist_dir="$deployment_dir/staging"
build_dist_dir="$deployment_dir/regional-s3-assets"
source_dir="$deployment_dir/../source"
lambda_artifact_name="lambda" # has to match cdk-solution-helper/parameterize-s3-paths-to-lambda-code.ts

build_python_artifacts() {
  echo "===================================="
  echo "[Build] Python sources"
  echo "===================================="
  cd $staging_dist_dir
  rm -fr $lambda_artifact_name

  echo "Copy $source_dir/$lambda_artifact_name to $staging_dist_dir"
  cp -R "$source_dir/$lambda_artifact_name" "$staging_dist_dir"

  cd $lambda_artifact_name
  rm -fr .venv
  rm -fr .venv-test
  pip3 install -r requirements.txt --target .
  pip3 install -U pip-licenses
  pip-licenses --from=mixed --order=license
  rm -fr __pycache__
  rm -fr tests
  rm -rf requirements.txt testing_requirements.txt .coveragerc LICENSE
}

package_lambda_dir()
{
  cd $staging_dist_dir/$lambda_artifact_name
  echo "Zipping following packages"
  pwd
  ls -ltr
  echo "zip -qr9 $staging_dist_dir/$lambda_artifact_name.zip ."
  zip -qr9 $staging_dist_dir/$lambda_artifact_name.zip .
  cd $staging_dist_dir

  if test -f $lambda_artifact_name.zip; then
    # Copy the zipped artifact from /staging to /regional-s3-assets
    echo "cp $lambda_artifact_name.zip $build_dist_dir"
    cp $lambda_artifact_name.zip $build_dist_dir
    cd ..
  else
    echo "ERROR: $lambda_artifact_name.zip not found"
    exit 1
  fi
}

echo "Create staging directory $staging_dist_dir"
mkdir -p "$staging_dist_dir"
build_python_artifacts
package_lambda_dir
echo "Finished build-lambdas.sh"