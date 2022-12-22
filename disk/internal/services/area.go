package services

import (
  "context"
  "os"
  "log"
  "fmt"
  "path/filepath"
  "errors"

  utils "github.com/teralion/live-connections/disk/internal/utils"
  pb "github.com/teralion/live-connections/disk/pkg/proto"
)

const allEntries = -1

type AreaManagerServer struct {
  pb.UnimplementedAreaManagerServer
  Dir string
  NameLen int
}

func NewAreaManagerServer(baseDir string) *AreaManagerServer {
  return &AreaManagerServer{Dir: baseDir, NameLen: 10}
}

func (s *AreaManagerServer) Create(ctx context.Context, request *pb.CreateAreaRequest) (*pb.CreateAreaResponse, error) {
  areaName := utils.RandomString(s.NameLen)

  if err := os.MkdirAll(filepath.Join(s.Dir, areaName), 0750); err != nil {
    return nil, errors.New("failed to make dir")
  }

  return &pb.CreateAreaResponse{Name: areaName}, nil
}

func (s *AreaManagerServer) ListUsers(ctx context.Context, request *pb.ListAreaUsersRequest) (*pb.ListAreaUsersResponse, error) {
  if !utils.IsNameSafe(request.Name) {
    return nil, fmt.Errorf("name %v is not safe", request.Name)
  }

  dir, err := os.Open(filepath.Join(s.Dir, request.Name))
  if err != nil {
    if os.IsNotExist(err) {
      return &pb.ListAreaUsersResponse{Users: []string{}}, os.ErrNotExist
    } else {
      return &pb.ListAreaUsersResponse{Users: []string{}}, errors.New("read dir error")
    }
  }

  names, err := dir.Readdirnames(allEntries)
  if err != nil {
    return &pb.ListAreaUsersResponse{Users: names}, errors.New("read entries error")
  }

  return &pb.ListAreaUsersResponse{Users: names}, nil
}